interface Props {
  name?: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = { sm: 'w-8 h-8 text-sm', md: 'w-10 h-10 text-base', lg: 'w-14 h-14 text-xl' };

export default function Avatar({ name, src, size = 'md', className = '' }: Props) {
  const initial = (name || '?')[0].toUpperCase();
  return (
    <div
      className={`rounded-full bg-[#128C7E]/20 flex items-center justify-center text-[#128C7E] font-bold overflow-hidden flex-shrink-0 ${sizes[size]} ${className}`}
    >
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}
