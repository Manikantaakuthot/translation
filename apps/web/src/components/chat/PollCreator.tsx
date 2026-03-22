import { useState } from 'react';
import { X, Plus, BarChart2, Check } from 'lucide-react';

interface PollOption {
  text: string;
}

interface Props {
  onSubmit: (poll: { question: string; options: string[]; allowMultiple: boolean }) => void;
  onClose: () => void;
}

export default function PollCreator({ onSubmit, onClose }: Props) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<PollOption[]>([{ text: '' }, { text: '' }]);
  const [allowMultiple, setAllowMultiple] = useState(false);

  const addOption = () => {
    if (options.length >= 12) return;
    setOptions([...options, { text: '' }]);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== index));
  };

  const updateOption = (index: number, text: string) => {
    setOptions(options.map((o, i) => (i === index ? { text } : o)));
  };

  const canSubmit = question.trim().length > 0 && options.filter((o) => o.text.trim()).length >= 2;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({
      question: question.trim(),
      options: options.filter((o) => o.text.trim()).map((o) => o.text.trim()),
      allowMultiple,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#233138] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-[#128C7E] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart2 size={18} className="text-white" />
            <span className="text-sm font-semibold text-white">Create Poll</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20 text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Question */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
              Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question..."
              maxLength={300}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2A3942] text-sm text-gray-800 dark:text-[#E9EDEF] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#128C7E]/40"
              autoFocus
            />
          </div>

          {/* Options */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
              Options
            </label>
            <div className="space-y-2">
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">{index + 1}</span>
                  </div>
                  <input
                    type="text"
                    value={option.text}
                    onChange={(e) => updateOption(index, e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    maxLength={100}
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-[#2A3942] text-sm text-gray-800 dark:text-[#E9EDEF] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#128C7E]/40"
                  />
                  {options.length > 2 && (
                    <button
                      onClick={() => removeOption(index)}
                      className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 12 && (
              <button
                onClick={addOption}
                className="mt-2 flex items-center gap-2 text-[#128C7E] text-sm font-medium hover:text-[#075E54] transition-colors"
              >
                <Plus size={16} />
                Add option
              </button>
            )}
          </div>

          {/* Allow Multiple */}
          <label className="flex items-center gap-3 cursor-pointer py-1">
            <div
              onClick={() => setAllowMultiple(!allowMultiple)}
              className={`w-10 h-5 rounded-full flex items-center transition-colors cursor-pointer ${
                allowMultiple ? 'bg-[#128C7E]' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform ${
                  allowMultiple ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </div>
            <span className="text-sm text-gray-700 dark:text-[#E9EDEF]">Allow multiple answers</span>
          </label>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-full border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#2A3942]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="flex-1 py-2.5 rounded-full bg-[#128C7E] text-white text-sm font-semibold hover:bg-[#075E54] disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <Check size={16} />
            Send Poll
          </button>
        </div>
      </div>
    </div>
  );
}
