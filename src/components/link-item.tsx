import { IconChevronRight } from "@tabler/icons-react"

import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item"

/** An outlined item that links to another page, as one entry in an `ItemGroup`. */
export function LinkItem({
  href,
  title,
  description,
}: {
  href: string
  title: string
  description?: string
}) {
  return (
    <div role="listitem">
      <Item variant="outline" render={<a href={href} />}>
        <ItemContent>
          <ItemTitle>{title}</ItemTitle>
          {description && <ItemDescription>{description}</ItemDescription>}
        </ItemContent>
        <ItemActions>
          <IconChevronRight className="size-4 text-muted-foreground" />
        </ItemActions>
      </Item>
    </div>
  )
}
