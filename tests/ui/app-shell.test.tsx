import { render, screen } from "@testing-library/react";
import { App } from "../../src/app/App";

it("renders the default restaurant heading", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "今日点餐" })).toBeInTheDocument();
});
