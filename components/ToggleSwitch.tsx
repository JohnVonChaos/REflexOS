
import React from 'react';

interface ToggleSwitchProps {
  checked: boolean;
  onToggle: () => void;
  title?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onToggle, title }) => {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onToggle}
      className={`relative inline-flex items-center h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-gray-800 ${
        checked ? 'bg-cyan-600' : 'bg-gray-600'
      }`}
      title={title}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
};
