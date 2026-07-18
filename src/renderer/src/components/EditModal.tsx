import { useState } from 'react'
import type { ModManifest } from '../../../../shared/types'
import { useI18n } from '../i18n'
import './EditModal.css'

interface EditModalProps {
  mod: ModManifest
  onClose: () => void
  onSave: (updatedMod: ModManifest) => void
}

export default function EditModal({ mod, onClose, onSave }: EditModalProps): React.JSX.Element {
  const { t, dir } = useI18n()
  const [nameAr, setNameAr] = useState(mod.nameAr)
  const [descriptionAr, setDescriptionAr] = useState(mod.descriptionAr)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      ...mod,
      nameAr,
      descriptionAr
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose} dir={dir}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('editModTitle')}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>{t('nameLabel')}</label>
            <input
              type="text"
              value={nameAr}
              onChange={(e) => setNameAr(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>{t('descLabel')}</label>
            <textarea
              value={descriptionAr}
              onChange={(e) => setDescriptionAr(e.target.value)}
              rows={3}
              required
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="btn-save">{t('save')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
