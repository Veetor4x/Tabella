import { m, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";
import { buttonHover, squish } from "./motion";

type Variant = "primary" | "secondary" | "small";

/** A big, friendly button that squishes under the finger and springs back. */
export const Button = forwardRef<HTMLButtonElement, { variant?: Variant } & HTMLMotionProps<"button">>(function Button(
  { variant = "primary", className = "", disabled, ...rest },
  ref,
) {
  const cls = ["btn", variant === "primary" ? "primary" : "secondary", variant === "small" ? "small" : "", className].filter(Boolean).join(" ");
  return (
    <m.button
      ref={ref}
      type="button"
      className={cls}
      disabled={disabled}
      whileTap={disabled ? undefined : squish}
      whileHover={disabled || variant !== "primary" ? undefined : buttonHover}
      {...rest}
    />
  );
});
