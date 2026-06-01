// Entry point. Loaded as <script type="module">. Routes between widget mode
// (?widget=1) and the dashboard once the DOM is ready.
import { runWidgetMode, bindWidgetMode } from "./widget/widget-mode.js";
import { initDashboard } from "./dashboard/dashboard.js";

window.addEventListener("DOMContentLoaded", () => {
  bindWidgetMode();

  const url = new URL(window.location.href);
  if (url.searchParams.get("widget") === "1") {
    void runWidgetMode();
    return;
  }

  void initDashboard();
});
