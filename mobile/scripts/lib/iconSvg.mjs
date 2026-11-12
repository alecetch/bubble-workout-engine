const canvasUnits = 200;
const markDiameter = 157;

export function withoutBackground(svg) {
  const result = svg.replace(/<rect\b[^>]*\bid="background"[^>]*\/>/, "");
  if (result === svg) throw new Error("Source SVG must contain the background rect");
  return result;
}
export function scaleMark(svg, fraction) {
  const scale = (fraction * canvasUnits) / markDiameter;
  return svg.replace(/<g\b(?=[^>]*\bid="mark")/, `<g transform="translate(100 100) scale(${scale}) translate(-100 -100)"><g`)
    .replace("</svg>", "</g></svg>");
}
