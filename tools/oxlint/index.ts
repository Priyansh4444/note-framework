import { definePlugin } from "@oxlint/plugins";
import noLowValueComments from "./rules/no-low-value-comments.ts";
import noNativeTitleTooltip from "./rules/no-native-title-tooltip.ts";
import requireSuppressionReason from "./rules/require-suppression-reason.ts";
export default definePlugin({
  meta: { name: "t3code" },
  rules: {
    "no-low-value-comments": noLowValueComments,
    "no-native-title-tooltip": noNativeTitleTooltip,
    "require-suppression-reason": requireSuppressionReason,
  },
});
