import { Link } from 'react-router-dom'

function BaseIcon({ children }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            {children}
        </svg>
    )
}

export function PlusIcon() {
    return (
        <BaseIcon>
            <path d="M12 5v14M5 12h14" />
        </BaseIcon>
    )
}

export function SwapIcon() {
    return (
        <BaseIcon>
            <path d="M8 7h11l-3-3M16 17H5l3 3M19 7H8M5 17h11" />
        </BaseIcon>
    )
}

export function FilterAllIcon() {
    return (
        <BaseIcon>
            <path d="M5 7h14M5 12h10M5 17h7" />
        </BaseIcon>
    )
}

export function FilterActiveIcon() {
    return (
        <BaseIcon>
            <path d="M5 14l3-3 3 2 4-6 4 3" />
        </BaseIcon>
    )
}

export function FilterDelayedIcon() {
    return (
        <BaseIcon>
            <path d="M12 7v5l3 2" />
            <circle cx="12" cy="12" r="8" />
        </BaseIcon>
    )
}

export function PauseIcon() {
    return (
        <BaseIcon>
            <path d="M8 6v12M16 6v12" />
        </BaseIcon>
    )
}

export function PlayIcon() {
    return (
        <BaseIcon>
            <path d="M8 5l10 7-10 7z" />
        </BaseIcon>
    )
}

export function RouteIcon() {
    return (
        <BaseIcon>
            <circle cx="6" cy="6" r="1.5" />
            <circle cx="18" cy="18" r="1.5" />
            <path d="M7.5 6h3.5c2.8 0 3.5 1.2 3.5 3.5V12c0 2.3.7 3.5 3.5 3.5H18" />
        </BaseIcon>
    )
}

export function ArrowLeftIcon() {
    return (
        <BaseIcon>
            <path d="M11 5 4 12l7 7M5 12h15" />
        </BaseIcon>
    )
}

export function ArrowRightIcon() {
    return (
        <BaseIcon>
            <path d="M13 5 20 12l-7 7M4 12h15" />
        </BaseIcon>
    )
}

export function PencilIcon() {
    return (
        <BaseIcon>
            <path d="M4 20h4l10-10-4-4L4 16v4" />
            <path d="M13 6l4 4" />
        </BaseIcon>
    )
}

export function TrashIcon() {
    return (
        <BaseIcon>
            <path d="M5 7h14" />
            <path d="M9 7V5h6v2" />
            <path d="M8 7l1 12h6l1-12" />
        </BaseIcon>
    )
}

export function CheckIcon() {
    return (
        <BaseIcon>
            <path d="M5 13l4 4 10-10" />
        </BaseIcon>
    )
}

export function SearchIcon() {
    return (
        <BaseIcon>
            <circle cx="11" cy="11" r="6.5" />
            <path d="M16 16l4 4" />
        </BaseIcon>
    )
}

export function IconButton({ icon: Icon, label, className = '', ...props }) {
    return (
        <button
            {...props}
            className={`icon-control icon-button ${className}`.trim()}
            aria-label={label}
            title={label}
        >
            <Icon />
            <span className="sr-only">{label}</span>
        </button>
    )
}

export function IconLink({ icon: Icon, label, className = '', ...props }) {
    return (
        <Link
            {...props}
            className={`icon-control icon-link ${className}`.trim()}
            aria-label={label}
            title={label}
        >
            <Icon />
            <span className="sr-only">{label}</span>
        </Link>
    )
}