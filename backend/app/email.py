import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"


async def send_email(to: str, subject: str, html: str) -> bool:
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY não configurado — email não enviado para %s", to)
        return False

    sender = f"{settings.email_from_name} <{settings.email_from}>"

    async with httpx.AsyncClient() as client:
        try:
            r = await client.post(
                RESEND_URL,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={"from": sender, "to": [to], "subject": subject, "html": html},
                timeout=10,
            )
            r.raise_for_status()
            logger.info("Email enviado para %s", to)
            return True
        except httpx.HTTPStatusError as e:
            logger.error("Falha ao enviar email para %s: %s — %s", to, e.response.status_code, e.response.text)
            return False
        except Exception as e:
            logger.error("Erro inesperado ao enviar email para %s: %s", to, e)
            return False


def _base_template(content: str) -> str:
    return f"""
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="100%" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
          <tr>
            <td style="background:#003580;padding:24px 32px;">
              <p style="margin:0;color:#FFCE00;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;">
                Governo do Estado de Pernambuco
              </p>
              <p style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:700;">
                DER-PE · Portal BI
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              {content}
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:11px;">
                Este é um email automático — não responda a esta mensagem.<br/>
                DER-PE · Departamento de Estradas de Rodagem de Pernambuco
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
"""


async def send_password_reset_email(to: str, full_name: str) -> bool:
    first_name = full_name.split()[0] if full_name else "Usuário"
    content = f"""
      <p style="margin:0 0 8px;font-size:15px;color:#374151;">Olá, <strong>{first_name}</strong>!</p>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
        Sua senha no Portal BI da DER-PE foi redefinida por um administrador.
        A nova senha temporária é:
      </p>
      <div style="background:#f3f4f6;border-radius:8px;padding:16px 24px;text-align:center;margin-bottom:24px;">
        <p style="margin:0;font-size:22px;font-weight:700;letter-spacing:.1em;color:#111827;font-family:monospace;">
          derpe123
        </p>
      </div>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
        Acesse o portal e você será solicitado a criar uma nova senha antes de continuar.
      </p>
      <p style="margin:0;font-size:13px;color:#9ca3af;">
        Se você não esperava esta mensagem, entre em contato com o administrador do sistema.
      </p>
    """
    return await send_email(to, "Sua senha foi redefinida — DER-PE Portal BI", _base_template(content))


async def send_account_created_email(to: str, full_name: str, username: str) -> bool:
    first_name = full_name.split()[0] if full_name else "Usuário"
    content = f"""
      <p style="margin:0 0 8px;font-size:15px;color:#374151;">Olá, <strong>{first_name}</strong>!</p>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
        Sua conta no Portal BI da DER-PE foi criada. Utilize as credenciais abaixo para o primeiro acesso:
      </p>
      <table style="background:#f3f4f6;border-radius:8px;padding:16px 24px;margin-bottom:24px;width:100%;box-sizing:border-box;">
        <tr>
          <td style="font-size:13px;color:#6b7280;padding:4px 0;">Usuário</td>
          <td style="font-size:14px;font-weight:700;color:#111827;font-family:monospace;padding:4px 0;">{username}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#6b7280;padding:4px 0;">Senha temporária</td>
          <td style="font-size:14px;font-weight:700;color:#111827;font-family:monospace;padding:4px 0;">derpe123</td>
        </tr>
      </table>
      <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
        No primeiro acesso você será solicitado a criar uma nova senha pessoal.
      </p>
      <p style="margin:0;font-size:13px;color:#9ca3af;">
        Se você não esperava esta mensagem, ignore-o ou entre em contato com o administrador.
      </p>
    """
    return await send_email(to, "Bem-vindo ao DER-PE Portal BI — acesso criado", _base_template(content))
