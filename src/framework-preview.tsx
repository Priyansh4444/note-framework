import { lazy } from "solid-js";
import { render } from "solid-js/web";
import { Route, Router } from "@solidjs/router";
import { TooltipLayer } from "./post/scene/tooltip";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/commit-mono/400.css";
import { installSpringVars } from "./post/scene/springs";
import "./post/post.css";
import "./post/theme.css";

installSpringVars();

const Studies = lazy(() => import("./notes/framework/Studies"));
const Home = lazy(() => import("./notes/framework"));
const Guide = lazy(() => import("./notes/framework/Docs").then((m) => ({ default: m.Docs })));
const ComponentLab = lazy(() => import("./notes/framework/ComponentLab"));
const Example = lazy(() => import("./notes/framework-demo"));
const SharedService = lazy(() => import("./notes/shared-service"));
const SpringWorkshop = lazy(() => import("./notes/spring-workshop"));
const InsideSvg = lazy(() => import("./notes/inside-svg"));
const Account = lazy(() => import("./notes/framework/Account"));

render(
  () => (
    <Router
      explicitLinks
      root={(props) => (
        <>
          {props.children}
          <TooltipLayer />
        </>
      )}
    >
      <Route path="/" component={Home} />
      <Route path="/docs" component={Guide} />
      <Route path="/studies" component={Studies} />
      <Route path="/components" component={ComponentLab} />
      <Route path="/account" component={Account} />
      <Route path="/agent/approve" component={Account} />
      <Route path="/notes/framework-demo" component={Example} />
      <Route path="/notes/shared-service" component={SharedService} />
      <Route path="/notes/inside-svg" component={InsideSvg} />
      <Route path="/notes/spring-workshop" component={SpringWorkshop} />
    </Router>
  ),
  document.getElementById("app")!,
);
