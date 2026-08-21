type AnalyzeMessage = { type: "analyze"; intent: string };
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

figma.ui.onmessage = async (message: AnalyzeMessage | { type: "close" }) => {
  if (message.type === "close") return figma.closePlugin();
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
    figma.ui.postMessage({ type: "exporting" });
    // The selected frame is exported exactly once per critique request.
    const imageBytes = await frame.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 1 } });
    figma.ui.postMessage({ type: "frame-export", frameName: frame.name, intent, imageBytes, hiddenState });
  } catch (error) {
    figma.ui.postMessage({ type: "error", message: error instanceof Error ? error.message : "The frame could not be exported." });
  }
};
