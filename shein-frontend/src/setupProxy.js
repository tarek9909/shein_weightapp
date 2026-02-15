const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: "https://sheinapp.xo.je",
      changeOrigin: true,
      secure: true,
    })
  );
};
