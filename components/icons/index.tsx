
import React from 'react';

// Common props for icons
const iconProps = {
    className: "w-4 h-4",
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 2,
};

export const PaperPlaneIcon: React.FC = () => (
    <svg {...iconProps} className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
);

export const StopIcon: React.FC = () => (
    <svg {...iconProps} className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <path d="M6 6h12v12H6z" />
    </svg>
);

export const TrashIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

export const CollapseIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export const ExpandIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export const CopyIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
);

export const CheckIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
);

export const CloseIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

export const DownloadIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

export const UploadIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
);

export const CompareIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
    </svg>
);

export const SearchIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

export const FileIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
);

export const FolderIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
);


export const FolderOpenIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
    </svg>
);

export const CpuChipIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
);

export const ClockIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export const ScaleIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
    </svg>
);

export const ChatBubbleLeftRightIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
);

export const UserIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

export const BotIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24" className="w-6 h-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z" />
    </svg>
);

export const BrainIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.463c-5.841 0-10.6-4.734-10.6-10.543A10.5 10.5 0 019.528 1.718z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a.75.75 0 00.75.75h.008a.75.75 0 00.75-.75v-.008a.75.75 0 00-.75-.75h-.008a.75.75 0 00-.75.75v.008z" />
    </svg>
);

export const BookIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
);

export const LightbulbIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 017.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
);

export const SaveIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3l-4-4-4 4z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h-6" />
    </svg>
);

export const LoadIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
);

export const SettingsIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066 2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

export const RefreshIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
);

export const DocumentTextIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
);

export const CrystalIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 8.5l10 13.5L22 8.5 12 2zM2 8.5l10 4.5M22 8.5L12 13m0 9V13" />
    </svg>
);

export const IncludeInContextIcon: React.FC = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>;
export const ExcludeFromContextIcon: React.FC = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" /></svg>;

export const PlayIcon: React.FC = () => <svg {...iconProps} fill="currentColor" strokeWidth="0"><path d="M8 5v14l11-7z" /></svg>;
export const PauseIcon: React.FC = () => <svg {...iconProps} fill="currentColor" strokeWidth="0"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>;
export const ZoomInIcon: React.FC = () => <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3h-6" /></svg>;
export const ZoomOutIcon: React.FC = () => <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" /></svg>;
export const ResetIcon: React.FC = () => <svg {...iconProps}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 4l16 16" /></svg>;

export const GlobeIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2h8a2 2 0 002-2v-1a2 2 0 012-2h1.945M7.704 4.343a9 9 0 0110.592 0m-12.592 0a9 9 0 0010.592 0M12 21a9 9 0 00-9-9h18a9 9 0 00-9 9z" />
    </svg>
);

export const SpeakerIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.108 12 5v14c0 .892-1.077 1.337-1.707.707L5.586 15z" />
    </svg>
);

export const SpeakerOffIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.108 12 5v14c0 .892-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l-4-4m0 4l4-4" />
    </svg>
);

export const MicrophoneIcon: React.FC = () => (
    <svg {...iconProps} className="w-5 h-5" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
);

export const WorkflowIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
    </svg>
);

export const NetworkIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg {...iconProps} viewBox="0 0 24 24" {...props} >
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15.75a7.5 7.5 0 01-7.5-7.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 8.25a7.5 7.5 0 01-7.5 7.5" />
        <circle cx="12" cy="12" r="2.25" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75a7.5 7.5 0 01-7.5-7.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 8.25a7.5 7.5 0 017.5 7.5" />
    </svg>
);

export const HistoryIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

export const ScalesIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        {/* Simple balance scales / calibration icon */}
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v4M4 7h16M7.5 11.5c0 2 2 3.5 4.5 3.5s4.5-1.5 4.5-3.5M7 7l2 4M17 7l-2 4M6 20c2-3 6-3 6 0m6 0c0-3-4-3-6 0" />
    </svg>
);

export const PlusIcon: React.FC = () => (
    <svg {...iconProps} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
);

export const GripVerticalIcon: React.FC = () => (
    <svg {...iconProps} className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M9 4h2v16H9zM13 4h2v16h-2z" />
    </svg>
);

export const ChevronDownIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
);
