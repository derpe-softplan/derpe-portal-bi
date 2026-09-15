import json
import logging
import time
from datetime import datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select

from app.db.models import RefreshLog, Report, ReportSnapshot
from app.db.session import AsyncSessionLocal
from app.superset.client import get_client

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="America/Recife")


async def run_refresh(report_id: int, triggered_by: str = "scheduler") -> dict:
    started_at = datetime.utcnow()
    t0 = time.monotonic()

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Report).where(Report.id == report_id))
        report = result.scalar_one_or_none()
        if not report:
            logger.error("run_refresh: report_id=%s não encontrado", report_id)
            return {}

        try:
            data = await get_client().query(report.sql_query)
            clean_data = json.loads(json.dumps(data, default=str))
            duration_ms = int((time.monotonic() - t0) * 1000)

            snap = (await db.execute(
                select(ReportSnapshot).where(ReportSnapshot.report_id == report_id)
            )).scalar_one_or_none()

            if snap:
                snap.data = clean_data
                snap.row_count = len(clean_data)
                snap.refreshed_at = datetime.utcnow()
            else:
                snap = ReportSnapshot(report_id=report_id, data=clean_data, row_count=len(clean_data))
                db.add(snap)

            db.add(RefreshLog(
                report_id=report_id,
                triggered_by=triggered_by,
                status="success",
                row_count=len(clean_data),
                duration_ms=duration_ms,
                started_at=started_at,
            ))
            await db.commit()

            logger.info(
                "Refresh OK | report_id=%s rows=%s duration=%dms trigger=%s",
                report_id, len(clean_data), duration_ms, triggered_by,
            )
            return {"refreshed_at": snap.refreshed_at, "row_count": snap.row_count}

        except Exception as exc:
            duration_ms = int((time.monotonic() - t0) * 1000)
            db.add(RefreshLog(
                report_id=report_id,
                triggered_by=triggered_by,
                status="error",
                duration_ms=duration_ms,
                error_message=str(exc)[:2000],
                started_at=started_at,
            ))
            await db.commit()
            logger.error("Refresh FALHOU | report_id=%s error=%s", report_id, exc)
            raise


def setup_scheduler(schedule_map: dict[int, str]) -> None:
    for report_id, cron_expr in schedule_map.items():
        try:
            trigger = CronTrigger.from_crontab(cron_expr, timezone="America/Recife")
            scheduler.add_job(
                run_refresh,
                trigger=trigger,
                id=f"refresh_{report_id}",
                kwargs={"report_id": report_id, "triggered_by": "scheduler"},
                replace_existing=True,
                misfire_grace_time=300,
            )
            logger.info("Agendamento registrado | report_id=%s cron='%s'", report_id, cron_expr)
        except Exception as exc:
            logger.error("Erro ao registrar agendamento | report_id=%s: %s", report_id, exc)
