import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

describe("sanity", () => {
  it("renderiza um elemento React simples", () => {
    render(<h1>Olá</h1>);
    expect(screen.getByRole("heading", { name: "Olá" })).toBeInTheDocument();
  });

  it("usa o helper cn de lib/utils", async () => {
    const { cn } = await import("@/lib/utils");
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
