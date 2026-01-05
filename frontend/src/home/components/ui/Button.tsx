import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost';
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  children,
  className = '',
  ...props
}) => {
  const baseStyles = "px-6 py-3 rounded-md font-semibold transition-all duration-300 text-sm md:text-base flex items-center justify-center";

  const variants = {
    primary: "bg-gradient-to-r from-brand-purple to-brand-orange hover:from-brand-purple/90 hover:to-brand-orange/90 text-white",
    outline: "border border-gray-300 hover:border-brand-purple text-gray-700 hover:text-brand-purple bg-transparent",
    ghost: "text-gray-600 hover:text-brand-purple bg-transparent"
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};