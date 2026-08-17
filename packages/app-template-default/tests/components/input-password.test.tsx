import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { InputPassword } from "@/components/auth/input-password";

describe("InputPassword", () => {
  it("reveals and hides the password without changing its value", async () => {
    const user = userEvent.setup();

    render(
      <InputPassword
        aria-label="Password"
        defaultValue="correct horse battery staple"
      />
    );

    const input = screen.getByLabelText("Password");
    expect(input).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveValue("correct horse battery staple");

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
    expect(input).toHaveValue("correct horse battery staple");
  });
});
