import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../src/app/App";

it("saves a diner name and reveals the menu shell", async () => {
  localStorage.clear();
  render(<App />);
  expect(screen.getByRole("dialog", { name: "输入点餐姓名" })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("姓名"), "张三");
  await userEvent.click(screen.getByRole("button", { name: "开始点餐" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "今日点餐" })).toBeInTheDocument();
  expect(localStorage.getItem("ordering.displayName")).toBe("张三");
});
