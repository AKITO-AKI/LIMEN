import React from 'react'

export function ConsentModal(props: {
  open: boolean
  onAccept: () => void
  onClose?: () => void
}) {
  if (!props.open) return null
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-title">LIMEN Prototype</div>
        <div className="modal-body">
          <div className="modal-list">
            <div className="modal-item">
              <div className="modal-dot" />
              <div>
                <div className="modal-line"><b>Camera</b> is used only to estimate a skeleton.</div>
                <div className="modal-sub">Raw video is not sent to the server.</div>
              </div>
            </div>
            <div className="modal-item">
              <div className="modal-dot" />
              <div>
                <div className="modal-line"><b>Skeleton + meaning</b> can be stored locally / on the prototype server.</div>
                <div className="modal-sub">For transparency logs and reproducibility.</div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={props.onAccept}>OK</button>
        </div>
      </div>
    </div>
  )
}
