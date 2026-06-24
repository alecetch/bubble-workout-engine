export function buildContentCarousel(slides, contentType) {
  return {
    templateKey: `CS_${contentType.toUpperCase().replace(/-/g, "_")}`,
    contentMode: contentType,
    slides,
    slideCount: slides.length,
    generatedAt: new Date().toISOString(),
  };
}
