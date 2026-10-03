import * as React from 'react'; import {cn} from '@/lib/utils'
const Table=React.forwardRef(({className,...p},r)=><div className='relative w-full overflow-auto'><table ref={r} className={cn('w-full caption-bottom text-sm',className)} {...p}/></div>);Table.displayName='Table'
const TableHeader=React.forwardRef(({className,...p},r)=><thead ref={r} className={cn('[&_tr]:border-b',className)} {...p}/>);TableHeader.displayName='TableHeader'
const TableBody=React.forwardRef(({className,...p},r)=><tbody ref={r} className={cn('[&_tr:last-child]:border-0',className)} {...p}/>);TableBody.displayName='TableBody'
const TableRow=React.forwardRef(({className,...p},r)=><tr ref={r} className={cn('border-b border-border/70 transition-colors hover:bg-muted/40',className)} {...p}/>);TableRow.displayName='TableRow'
const TableHead=React.forwardRef(({className,...p},r)=><th ref={r} className={cn('h-12 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground',className)} {...p}/>);TableHead.displayName='TableHead'
const TableCell=React.forwardRef(({className,...p},r)=><td ref={r} className={cn('p-4 align-middle',className)} {...p}/>);TableCell.displayName='TableCell'
export {Table,TableHeader,TableBody,TableRow,TableHead,TableCell}
