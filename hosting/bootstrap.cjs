const { createServer } = require("node:http");

function startServer({
  initialize,
  port = process.env.PORT || 3000,
  host = "0.0.0.0",
  logger = console,
}) {
  let handler;
  const server = createServer((request, response) => {
    if (handler) return handler(request, response);
    response.writeHead(503, {
      "Content-Type": "text/plain; charset=utf-8",
      "Retry-After": "5",
      "Cache-Control": "no-store",
    });
    response.end("Application is starting. Please retry shortly.");
  });
  // Managed loaders must observe listen() in their own process before async setup.
  server.listen(port, host, () =>
    logger.log("Hostinger HTTP listener started."),
  );
  const ready = Promise.resolve()
    .then(initialize)
    .then((app) => {
      handler = app;
      logger.log("Easy Testimonials is ready.");
    })
    .catch((error) => {
      server.close();
      throw error;
    });
  return { server, ready };
}
module.exports = { startServer };
