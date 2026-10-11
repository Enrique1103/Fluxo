import bcrypt
from datetime import datetime, timedelta, timezone
from jose import jwt
import os
from dotenv import load_dotenv


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())

# Carga las variables del archivo .env
load_dotenv()

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES"))
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM")

# Sin una clave larga y secreta, cualquiera podría fabricar tokens válidos
if not SECRET_KEY:
    raise RuntimeError("Falta SECRET_KEY en las variables de entorno")
if len(SECRET_KEY) < 32:
    import logging
    logging.getLogger("fluxo").warning("SECRET_KEY es corta (menos de 32 caracteres): conviene cambiarla por una más larga")
if ALGORITHM not in ("HS256", "HS384", "HS512"):
    raise RuntimeError("ALGORITHM debe ser HS256, HS384 o HS512")

# Crear el token
def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)