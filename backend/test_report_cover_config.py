from app.db.models import Report


def test_report_supports_cover_image_and_access_metadata():
    assert hasattr(Report, "cover_image_url")
    assert hasattr(Report, "access_profiles")
    assert hasattr(Report, "access_users")
