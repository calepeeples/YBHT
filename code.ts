type AnalyzeMessage = { type: "analyze"; intent: string };
type PlaceReportMessage = { type: "place-report"; imageBytes: Uint8Array; width: number; height: number; outcome: string };
type HiddenState = {
  egoMeter: number | null;
  bullshitDetector: number | null;
  designIntegrity: number | null;
  stakeholderConfidence: number | null;
  decisionQuality: number | null;
  chaos: number | null;
};

// Reserved for later versions. v0.1 deliberately does not calculate or display these.
const hiddenState: HiddenState = {
  egoMeter: null,
  bullshitDetector: null,
  designIntegrity: null,
  stakeholderConfidence: null,
  decisionQuality: null,
  chaos: null,
};

figma.showUI(__html__, { width: 440, height: 640, themeColors: true });
let reviewedFrameId: string | null = null;

function selectedFrame(): FrameNode | null {
  const selection = figma.currentPage.selection;
  return selection.length === 1 && selection[0].type === "FRAME" ? selection[0] : null;
}

function sendSelectionState() {
  const frame = selectedFrame();
  figma.ui.postMessage({ type: "selection", valid: Boolean(frame), name: frame?.name ?? null });
}

figma.on("selectionchange", sendSelectionState);
sendSelectionState();

figma.ui.onmessage = async (message: AnalyzeMessage | PlaceReportMessage | { type: "close" }) => {
  if (message.type === "close") return figma.closePlugin();
  if (message.type === "place-report") {
    try {
      const image = figma.createImage(message.imageBytes);
      const card = figma.createRectangle();
      const scale = Math.min(1, 640 / message.width);
      card.resize(message.width * scale, message.height * scale);
      card.name = `Your Boss Has Thoughts — ${message.outcome}`;
      card.fills = [{ type: "IMAGE", scaleMode: "FILL", imageHash: image.hash }];
      const frame = reviewedFrameId ? await figma.getNodeByIdAsync(reviewedFrameId) : null;
      if (frame && "x" in frame && "width" in frame && "y" in frame) {
        card.x = frame.x + frame.width + 80;
        card.y = frame.y;
      } else {
        card.x = figma.viewport.center.x - card.width / 2;
        card.y = figma.viewport.center.y - card.height / 2;
      }
      figma.currentPage.selection = [card];
      figma.viewport.scrollAndZoomIntoView([card]);
      figma.ui.postMessage({ type: "report-placed" });
    } catch (error) {
      figma.ui.postMessage({ type: "error", message: error instanceof Error ? error.message : "The report could not be placed in Figma." });
    }
    return;
  }
  if (message.type !== "analyze") return;
  const frame = selectedFrame();
  if (!frame) {
    figma.ui.postMessage({ type: "error", message: "Select exactly one frame, then try again." });
    return;
  }
  const intent = message.intent.trim();
  if (!intent) {
    figma.ui.postMessage({ type: "error", message: "Tell your boss what this design is trying to do." });
    return;
  }
  try {
    reviewedFrameId = frame.id;
    figma.ui.postMessage({ type: "exporting" });
    // The selected frame is exported exactly once per critique request.
    const imageBytes = await frame.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
    figma.ui.postMessage({ type: "frame-export", frameName: frame.name, intent, imageBytes, hiddenState });
  } catch (error) {
    figma.ui.postMessage({ type: "error", message: error instanceof Error ? error.message : "The frame could not be exported." });
  }
};
