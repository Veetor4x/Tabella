import { m } from "framer-motion";
import { forwardRef, type ReactNode } from "react";
import { IconArrow, IconBack } from "./icons";
import { pressTap } from "./motion";

interface Props {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** primary = the wax-red main button, glass = frosted, quiet = text only */
  variant?: "primary" | "glass" | "quiet";
  arrow?: "forward" | "back";
  type?: "button" | "submit";
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button({ children, onClick, disabled, variant = "primary", arrow, type = "button" }, ref) {
  return (
    <m.button ref={ref} type={type} className={`btn ${variant}`} onClick={onClick} disabled={disabled} whileTap={disabled ? undefined : pressTap}>
      {arrow === "back" && <IconBack size={18} />}
      <span>{children}</span>
      {arrow === "forward" && <IconArrow size={18} />}
    </m.button>
  );
});
