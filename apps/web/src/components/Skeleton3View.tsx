import React from 'react'
import type { Skeleton } from '../lib/types'
import { SkeletonCanvas } from './SkeletonCanvas'

export function Skeleton3View(props: { skeleton: Skeleton; timeSec?: number }) {
  return (
    <div className="threeview">
      <div className="threeview-item">
        <div className="threeview-label">FRONT</div>
        <SkeletonCanvas skeleton={props.skeleton} view="front" timeSec={props.timeSec} showGrid />
      </div>
      <div className="threeview-item">
        <div className="threeview-label">SIDE</div>
        <SkeletonCanvas skeleton={props.skeleton} view="side" timeSec={props.timeSec} showGrid />
      </div>
      <div className="threeview-item">
        <div className="threeview-label">TOP</div>
        <SkeletonCanvas skeleton={props.skeleton} view="top" timeSec={props.timeSec} showGrid />
      </div>
    </div>
  )
}
