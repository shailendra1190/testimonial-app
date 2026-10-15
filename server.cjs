const { startServer } = require("./hosting/bootstrap.cjs");
// Hostinger imports this file, so startup must not depend on require.main.
const running = startServer({
  initialize: () =>
    import("./server.js").then((app) => app.createProductionHandler()),
});
running.ready.catch((error) => {
  console.error("Easy Testimonials startup failed:", error.message);
  process.exitCode = 1;
});
module.exports = running;
