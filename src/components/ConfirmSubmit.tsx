"use client";

/** A submit button that asks for confirmation first. */
export default function ConfirmSubmit({
  message,
  children,
  className,
  name,
  value,
}: {
  message: string;
  children: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      name={name}
      value={value}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
