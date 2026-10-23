
const COOKIE_NAME = "admincond_refresh";

const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

const COOKIE_PATH = "/api/auth";

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
  };
}

// Guardar el refresh token en una cookie HttpOnly
export function setRefreshCookie(res, refreshToken) {
  res.cookie(COOKIE_NAME, refreshToken, {
    ...cookieOptions(),
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

// Leer exclusivamente nuestra cookie de autenticación
export function getRefreshCookie(req) {
  const cookieHeader = req.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));

  if (!cookie) {
    return null;
  }

  const value = cookie.slice(COOKIE_NAME.length + 1);

  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}
