from app.admin.router import UPLOADS_DIR as admin_uploads_dir
from app.main import UPLOADS_DIR as main_uploads_dir


def test_uploads_dir_is_consistent():
    assert admin_uploads_dir == main_uploads_dir
