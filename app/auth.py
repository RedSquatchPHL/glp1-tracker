from fastapi import Request, HTTPException, status, Depends
from fastapi.security import APIKeyCookie
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from app.config import SECRET_KEY, APP_PASSWORD

serializer = URLSafeTimedSerializer(SECRET_KEY, salt="glp1_session")

def create_session_token(data: dict = {"authenticated": True}) -> str:
    return serializer.dumps(data)

def verify_session_token(token: str) -> bool:
    if not token:
        return False
    try:
        data = serializer.loads(token, max_age=86400 * 30) # 30 days session
        return data.get("authenticated", False)
    except (BadSignature, SignatureExpired):
        return False

def get_current_user(request: Request):
    # Check session cookie
    token = request.cookies.get("session")
    if verify_session_token(token):
        return True
    
    # Check Bearer token or custom header for programmatic access
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        bearer_token = auth_header.split(" ")[1]
        if bearer_token == APP_PASSWORD or verify_session_token(bearer_token):
            return True

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated"
    )
