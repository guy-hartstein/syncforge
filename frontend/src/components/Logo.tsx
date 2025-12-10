interface LogoProps {
  className?: string
  size?: number
}

export function Logo({ className = '', size = 40 }: LogoProps) {
  return (
    <img 
      src="/logo.png" 
      alt="SyncForge" 
      width={size} 
      height={size}
      className={className}
    />
  )
}
