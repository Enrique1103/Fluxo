import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Carga las variables del archivo .env
load_dotenv()

# Obtiene la URL de conexión
DATABASE_URL = os.getenv("DATABASE_URL")

# Crea el motor para la conexión con la base de datos
_DEBUG = os.getenv("DEBUG", "false").lower() == "true"
engine = create_engine(DATABASE_URL, echo=_DEBUG, pool_pre_ping=True)

# Crea la sesión
Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Función para obtener la sesión de la base de datos (Inyección de Dependencia)
def get_db():
    db = Session()
    try:
        yield db
    finally:
        db.close()