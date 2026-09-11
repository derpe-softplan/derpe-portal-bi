from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    superset_url: str
    superset_user: str
    superset_password: str
    superset_database_name: str = "BI-PRO-CONSULTA"
    superset_schema: str = "siderdwh"
    superset_verify_ssl: bool = True

    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str = "derpe_portal"
    postgres_user: str = "derpe"
    postgres_password: str

    redis_url: str = "redis://redis:6379"
    cache_ttl: int = 3600

    jwt_secret: str
    jwt_expire_hours: int = 8

    app_env: str = "production"
    cors_origins: str = "http://localhost:8080"

    admin_email: str = "admin@der.pe.gov.br"
    admin_password: str

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    model_config = {"env_file": ".env"}


settings = Settings()
