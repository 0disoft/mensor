import type {
  Diagnostic,
  FeatureContract,
  RouteMissingDiagnostic,
} from "@0disoft/mensor-contract";

import {
  actionRoutePropertyRange,
  projectRouteIndexRange,
} from "./locations.js";
import type { VerifiedRouteIndex } from "./route-index.js";

export function checkFeatureRoutes(options: {
  readonly featureContractPath: string;
  readonly featureText: string;
  readonly feature: FeatureContract;
  readonly projectContractPath: string;
  readonly projectText: string;
  readonly routeIndexPath: string;
  readonly routeIndex: VerifiedRouteIndex;
}): readonly Diagnostic[] {
  const diagnostics: RouteMissingDiagnostic[] = [];

  options.feature.actions.forEach((action, actionIndex) => {
    const key = `${action.route.method}\u0000${action.route.path}`;
    if (options.routeIndex.routeKeys.has(key)) {
      return;
    }
    diagnostics.push({
      code: "route.missing",
      severity: "error",
      category: "route-contract",
      message: `RouteIndex does not contain ${action.route.method} ${JSON.stringify(action.route.path)} for action ${JSON.stringify(action.id)}.`,
      file: options.featureContractPath,
      range: actionRoutePropertyRange(options.featureText, actionIndex, "path"),
      facts: {
        actionId: action.id,
        expectedMethod: action.route.method,
        expectedPath: action.route.path,
        routeIndex: options.routeIndexPath,
        sameMethodPaths: options.routeIndex.postPaths,
      },
      related: [
        {
          role: "route-index-declaration",
          message: "The project contract enables this source-bound RouteIndex.",
          file: options.projectContractPath,
          range: projectRouteIndexRange(options.projectText),
        },
      ],
      repair: {
        strategy: "reconcile-indexed-route",
        hint: `Add ${action.route.method} ${action.route.path} to the application route source and regenerate ${options.routeIndexPath}, or update the action contract when the route change is intentional.`,
        mustPreserve: [
          `action ${action.id}`,
          `form route ${action.route.path}`,
          "source-bound RouteIndex verification",
        ],
        mustNot: [
          "delete the RouteIndex declaration",
          "edit the content digest without regenerating route facts",
          "weaken the form action contract",
        ],
      },
    });
  });
  return diagnostics;
}
