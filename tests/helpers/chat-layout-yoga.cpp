// Exercise the same Yoga source shipped with this app's React Native version.
// Text measurement is a synthetic wrapping model, not Android font rendering.
#include <yoga/Yoga.h>
#include <algorithm>
#include <cmath>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

struct TextSize { float width; float lineHeight; };
static YGSize measure(YGNodeConstRef node, float width, YGMeasureMode mode, float, YGMeasureMode) {
  auto text = static_cast<TextSize*>(YGNodeGetContext(node));
  float available = mode == YGMeasureModeUndefined ? text->width : std::max(1.0f, width);
  float lines = std::max(1.0f, std::ceil(text->width / available));
  return {mode == YGMeasureModeExactly ? width : std::min(text->width, available), lines * text->lineHeight};
}
int main() {
  auto config = YGConfigNew();
  YGConfigSetUseWebDefaults(config, false);
  // YogaLayoutableShadowNode uses YGErrataAll by default in RN 0.86.
  YGConfigSetErrata(config, YGErrataAll);
  YGConfigSetPointScaleFactor(config, 0);
  std::vector<YGNodeRef> nodes;
  std::vector<TextSize*> textSizes;
  std::string line;
  while (std::getline(std::cin, line)) {
    std::istringstream in(line); std::string command; int id; in >> command >> id;
    if (command == "node") {
      int parent; in >> parent;
      auto node = YGNodeNewWithConfig(config); nodes.push_back(node);
      if (parent >= 0) YGNodeInsertChild(nodes[parent], node, YGNodeGetChildCount(nodes[parent]));
    } else if (command == "text") {
      float width, height; in >> width >> height;
      auto size = new TextSize{width, height}; textSizes.push_back(size);
      YGNodeSetContext(nodes[id], size); YGNodeSetMeasureFunc(nodes[id], measure);
    } else if (command == "style") {
      std::string key; float value; in >> key >> value; auto node = nodes[id];
      if (key == "width") YGNodeStyleSetWidth(node, value);
      else if (key == "widthPercent") YGNodeStyleSetWidthPercent(node, value);
      else if (key == "maxWidth") YGNodeStyleSetMaxWidth(node, value);
      else if (key == "maxWidthPercent") YGNodeStyleSetMaxWidthPercent(node, value);
      else if (key == "minWidth") YGNodeStyleSetMinWidth(node, value);
      else if (key == "height") YGNodeStyleSetHeight(node, value);
      else if (key == "minHeight") YGNodeStyleSetMinHeight(node, value);
      else if (key == "flex") YGNodeStyleSetFlex(node, value);
      else if (key == "flexGrow") YGNodeStyleSetFlexGrow(node, value);
      else if (key == "flexShrink") YGNodeStyleSetFlexShrink(node, value);
      else if (key == "flexBasis") YGNodeStyleSetFlexBasis(node, value);
      else if (key == "gap") YGNodeStyleSetGap(node, YGGutterAll, value);
      else if (key == "padding") YGNodeStyleSetPadding(node, YGEdgeAll, value);
      else if (key == "paddingHorizontal") YGNodeStyleSetPadding(node, YGEdgeHorizontal, value);
      else if (key == "paddingVertical") YGNodeStyleSetPadding(node, YGEdgeVertical, value);
      else if (key == "borderWidth") YGNodeStyleSetBorder(node, YGEdgeAll, value);
      else if (key == "row") YGNodeStyleSetFlexDirection(node, YGFlexDirectionRow);
      else if (key == "alignStart") YGNodeStyleSetAlignItems(node, YGAlignFlexStart);
      else if (key == "alignEnd") YGNodeStyleSetAlignItems(node, YGAlignFlexEnd);
      else if (key == "alignCenter") YGNodeStyleSetAlignItems(node, YGAlignCenter);
      else if (key == "justifyCenter") YGNodeStyleSetJustifyContent(node, YGJustifyCenter);
    }
  }
  YGNodeCalculateLayout(nodes[0], YGUndefined, YGUndefined, YGDirectionLTR);
  for (size_t id = 0; id < nodes.size(); ++id) {
    auto node = nodes[id];
    std::cout << id << ' ' << YGNodeLayoutGetLeft(node) << ' ' << YGNodeLayoutGetTop(node) << ' ' << YGNodeLayoutGetWidth(node) << ' ' << YGNodeLayoutGetHeight(node) << '\n';
  }
  YGNodeFreeRecursive(nodes[0]); YGConfigFree(config);
  for (auto size : textSizes) delete size;
}
