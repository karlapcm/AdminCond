
import "dotenv/config";
import app from "./http-app.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";

app.listen(PORT, HOST, () => {
  console.log(
    `AdminCond API escuchando en ${HOST}:${PORT}`
  );
});
