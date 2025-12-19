interface LogoProps {
  className?: string
  size?: number
}

export function Logo({ className = '', size = 40 }: LogoProps) {
  return (
    <img 
      src="/syncforge.jpg" 
      alt="SyncForge" 
      width={size} 
      height={size}
      className={`rounded-lg ${className}`}
    />
  )
}
