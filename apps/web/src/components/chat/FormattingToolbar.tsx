import { Bold, Italic, Strikethrough, Code } from 'lucide-react';

interface Props {
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>;
  text: string;
  setText: (text: string) => void;
}

function wrapSelection(
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement>,
  text: string,
  setText: (text: string) => void,
  wrapper: string
) {
  const input = inputRef.current;
  if (!input) return;

  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? 0;

  if (start === end) {
    // No selection — insert wrapper pair at cursor
    const newText = text.slice(0, start) + wrapper + wrapper + text.slice(end);
    setText(newText);
    setTimeout(() => {
      input.setSelectionRange(start + wrapper.length, start + wrapper.length);
      input.focus();
    }, 0);
  } else {
    // Wrap selected text
    const selected = text.slice(start, end);
    // Check if already wrapped — toggle off
    if (
      text.slice(start - wrapper.length, start) === wrapper &&
      text.slice(end, end + wrapper.length) === wrapper
    ) {
      const newText =
        text.slice(0, start - wrapper.length) + selected + text.slice(end + wrapper.length);
      setText(newText);
      setTimeout(() => {
        input.setSelectionRange(start - wrapper.length, end - wrapper.length);
        input.focus();
      }, 0);
    } else {
      const newText = text.slice(0, start) + wrapper + selected + wrapper + text.slice(end);
      setText(newText);
      setTimeout(() => {
        input.setSelectionRange(start + wrapper.length, end + wrapper.length);
        input.focus();
      }, 0);
    }
  }
}

export default function FormattingToolbar({ inputRef, text, setText }: Props) {
  const buttons = [
    { icon: Bold, wrapper: '*', label: 'Bold', shortcut: 'Ctrl+B' },
    { icon: Italic, wrapper: '_', label: 'Italic', shortcut: 'Ctrl+I' },
    { icon: Strikethrough, wrapper: '~', label: 'Strikethrough', shortcut: 'Ctrl+Shift+S' },
    { icon: Code, wrapper: '`', label: 'Monospace', shortcut: 'Ctrl+E' },
  ];

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 bg-white dark:bg-[#2A3942] border-t border-gray-100 dark:border-gray-700 rounded-t-xl">
      {buttons.map(({ icon: Icon, wrapper, label, shortcut }) => (
        <button
          key={wrapper}
          type="button"
          onClick={() => wrapSelection(inputRef, text, setText, wrapper)}
          className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-[#128C7E] dark:hover:text-[#00A884] hover:bg-gray-100 dark:hover:bg-[#3B4A54] transition-colors"
          title={`${label} (${shortcut})`}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
