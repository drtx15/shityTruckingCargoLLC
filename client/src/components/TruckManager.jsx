import { useState } from 'react'
import { IconButton, TrashIcon, CheckIcon, PlusIcon, PencilIcon } from './IconControls'

function TruckManager({
    trucks,
    draftLabels,
    onDraftChange,
    onSave,
    onDelete,
    onCreate,
    newTruckLabel,
    onNewTruckLabelChange
}) {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)

    const handleEditClick = () => {
        setIsEditModalOpen(true)
    }

    const handleCloseModal = () => {
        setIsEditModalOpen(false)
    }

    return (
        <section className="panel truck-manager">
            <div className="dashboard-header">
                <div>
                    <h2>Trucks</h2>
                </div>
            </div>

            <form className="filter-bar truck-create-bar" onSubmit={onCreate}>
                <input
                    type="text"
                    value={newTruckLabel}
                    onChange={(event) => onNewTruckLabelChange(event.target.value)}
                    placeholder="Truck label"
                    minLength={2}
                    required
                />
                <IconButton type="submit" icon={PlusIcon} label="Create truck" />
                <IconButton
                    type="button"
                    icon={PencilIcon}
                    label="Edit trucks"
                    onClick={handleEditClick}
                />
            </form>

            {isEditModalOpen && (
                <div className="modal-overlay" onClick={handleCloseModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Edit Trucks</h3>
                            <button
                                type="button"
                                className="modal-close"
                                onClick={handleCloseModal}
                                aria-label="Close"
                            >
                                ×
                            </button>
                        </div>
                        <div className="truck-list">
                            {trucks.map((truck) => (
                                <article key={truck.id} className="truck-row">
                                    <input
                                        value={draftLabels[truck.id] ?? truck.label}
                                        onChange={(event) => onDraftChange(truck.id, event.target.value)}
                                        aria-label={`Truck ${truck.id} label`}
                                    />
                                    <span className="truck-status">{truck.status}</span>
                                    <IconButton
                                        type="button"
                                        icon={CheckIcon}
                                        label={`Save truck ${truck.id}`}
                                        className="icon-button--soft"
                                        onClick={() => onSave(truck.id)}
                                    />
                                    <IconButton
                                        type="button"
                                        icon={TrashIcon}
                                        label={`Delete truck ${truck.id}`}
                                        className="icon-button--soft"
                                        onClick={() => onDelete(truck.id)}
                                    />
                                </article>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </section>
    )
}

export default TruckManager