import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CachedImage } from "./CachedImage";

const uri = "https://cdn.test/still-thumb.webp";

describe("CachedImage", () => {
  it("uses disk caching, a thumbhash placeholder, cover fits and a default cross-fade", () => {
    render(<CachedImage uri={uri} thumbhash="blur-hash" style={{ width: 56 }} recyclingKey={uri} testID="image" />);
    const image = screen.getByTestId("image");
    expect(image).toHaveAttribute("src", uri);
    expect(image).toHaveAttribute("data-cache-policy", "memory-disk");
    expect(image).toHaveAttribute("data-thumbhash", "blur-hash");
    expect(image).toHaveAttribute("data-recycling-key", uri);
    expect(image).toHaveAttribute("data-content-fit", "cover");
    expect(image).toHaveAttribute("data-placeholder-content-fit", "cover");
    expect(image).toHaveAttribute("data-transition", "200");
    expect(image).toHaveStyle({ width: "56px" });
  });

  it("omits a missing placeholder and accepts fit and transition overrides", () => {
    render(<CachedImage uri={uri} style={{}} contentFit="contain" transitionMs={300} testID="image" />);
    expect(screen.getByTestId("image")).not.toHaveAttribute("data-thumbhash");
    expect(screen.getByTestId("image")).toHaveAttribute("data-content-fit", "contain");
    expect(screen.getByTestId("image")).toHaveAttribute("data-transition", "300");
  });

  it.each(["", null, undefined])("renders nothing for URI %s", empty => {
    const { container } = render(<CachedImage uri={empty} style={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("forwards load and error events", () => {
    const onLoad = vi.fn();
    const onError = vi.fn();
    render(<CachedImage uri={uri} style={{}} onLoad={onLoad} onError={onError} testID="image" />);
    fireEvent.load(screen.getByTestId("image"));
    fireEvent.error(screen.getByTestId("image"));
    expect(onLoad).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });
});
