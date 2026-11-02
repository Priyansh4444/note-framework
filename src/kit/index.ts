/**
 * The note kit: everything a new note needs, in one import.
 *
 *   import { defineNote, Figure, Check, SceneFrame, createScene, enter, tip } from "../../kit";
 *
 * Start a note with `bun run note:new <slug> "Title"`; see .agents/skills/note-explainers/SKILL.md.
 */
import "./kit.css";
import "./motion.css";

export {
  defineNote,
  usePageHead,
  type ChapterSpec,
  type NoteMeta,
  type Source,
  type Term,
} from "./note";
export {
  ArrowLabel,
  Check,
  DisclosureSummary,
  Equation,
  Figure,
  Model,
  Steps,
  Table,
} from "./parts";
export { clamp01, enter, mix, since, type Curve } from "./anim";
export { SceneFrame } from "../post/scene/Scene";
export { createScene, lerp, type Beat, type Scene } from "../post/scene/clock";
export { SPRINGS, springCurve } from "../post/scene/springs";
export { tip } from "../post/scene/tooltip";
export { Tex } from "../components/ui/Tex";
export { MathMorph } from "../components/ui/MathMorph";

export { DiagramViewer, useDiagram } from "./DiagramViewer";
export { Handle, type HandleProps, type Point } from "./Handle";
export { Axes, type Tick } from "./Axes";
export {
  Action,
  Choice,
  Legend,
  More,
  Readout,
  Panels,
  Toolbar,
  type ChoiceOption,
  type LegendItem,
} from "./ui";
export { blend, glide, jump, resize, still } from "./motion";
export { Parameter, type ParameterProps } from "./Parameter";
export { Experiment, type ExperimentProps } from "./Experiment";
export { CodeBlock, type CodeArtifact } from "./CodeBlock";
export { auditLayout, type AuditLayout } from "./layout";

export { createPlayback, type PlaybackSpec } from "./playback";
export { CurveTimeline } from "./CurveTimeline";

export type { CuePlan, CueName } from "./scene-audio";

export { LayerFigure, type LayerFigureProps, type FigureLayer } from "./patterns/LayerFigure";
export {
  MorphFigure,
  makeMorphShapes,
  resampleContour,
  type MorphFigureProps,
  type MorphShape,
  type MorphPoint,
} from "./patterns/MorphFigure";
export {
  InkFigure,
  brushStroke,
  type InkFigureProps,
  type InkMark,
  type InkScene,
  type BrushOptions,
} from "./patterns/InkFigure";
