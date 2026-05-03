import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createShipment, getShippers } from '../api'
import ShipmentForm from '../components/ShipmentForm'

function ShipmentNewPage({
    eyebrow = 'Shipment intake',
    title = 'Create shipment',
    detailBasePath = '/shipments',
    hideShipper = false
}) {
    const navigate = useNavigate()
    const [shippers, setShippers] = useState([])
    const [error, setError] = useState('')

    useEffect(() => {
        if (hideShipper) {
            setShippers([])
            return
        }

        getShippers().then(setShippers).catch(() => setShippers([]))
    }, [hideShipper])

    const handleCreate = async (payload) => {
        try {
            const shipment = await createShipment(payload)
            navigate(`${detailBasePath}/${shipment.id}`)
        } catch (err) {
            setError(err.message)
        }
    }

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">{eyebrow}</p>
                    <h2>{title}</h2>
                </div>
            </div>
            {error && <p className="error-text">{error}</p>}
            <ShipmentForm onCreate={handleCreate} shippers={shippers} expanded hideShipper={hideShipper} />
        </section>
    )
}

export default ShipmentNewPage
