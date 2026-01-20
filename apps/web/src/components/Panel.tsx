import React from 'react'

export function Panel(props: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div className="panel-title">{props.title}</div>
        {props.badge ? <div className="badge">{props.badge}</div> : null}
      </div>
      <div className="panel-body">{props.children}</div>
    </section>
  )
}
