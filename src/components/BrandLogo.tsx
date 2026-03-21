import sportzxLogo from '../assets/sportzx-logo.svg';

interface BrandLogoProps {
  className?: string;
}

export function BrandLogo({ className = '' }: BrandLogoProps) {
  return <img className={className} src={sportzxLogo} alt="" aria-hidden="true" />;
}
