import * as React from "react";
import { cn } from "../../lib/utils";
import logoSrc from "../../assets/1code-logo.png";

interface LogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  className?: string;
}

export function Logo({ className, ...props }: LogoProps) {
  return (
    <img
      src={logoSrc}
      alt="1Code logo"
      aria-label="1Code logo"
      className={cn("w-full h-full object-contain", className)}
      draggable={false}
      {...props}
    />
  );
}
