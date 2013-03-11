-- Bender operational semantics using Haskell

data Component =
  Component String (Maybe Component) [Link] [View] [Property] [Property] [Watch]

data Link = Link String Rel
data Rel = Script | Stylesheet

data View = View (Maybe String) Stacking [ViewNode]
data Stacking = Top | Bottom | Replace

data ViewNode = DOMTextNode String
              | DOMElement String String [DOMAttribute] [ViewNode]
              | ComponentElement Component
              | ContentElement (Maybe String) [ViewNode]
              | TextElement String String

data DOMAttribute = DOMAttribute String String String

data Property = Property String Anything  -- Property name value

data Watch = Watch [Get] [Set]                -- TODO transform function
data Get = GetProperty Component String       -- GetProperty source name
         | GetDOMEvent ViewNode String        -- GetDOMEvent source type
         | GetEvent Component String          -- GetEvent source type
data Set = SetProperty Component String       -- SetProperty target name
         | SetEvent String                    -- SetEvent type
         | SetDOMAttribute ViewNode String    -- SetDOMAttribute target name
         | SetDOMPoperty ViewNode String      -- SetDOMProperty target name
         | SetAction ViewNode Action
         | SetInsert ViewNode Position
data Action = Append | Prepend | Remove
data Position = Before | After | Instead

data Event = Event Component String [Anything]

data Anything = Anything


get_views :: Component -> [View]
get_views (Component _ None _ vs _ _ _) = vs
get_views (Component _ (Just k) _ [] _ _ _) = get_views k
get_views (Component _ (Just k) _ vs _ _ _) = combine_views (get_views k) vs

combine_views :: [View] -> [View] -> [View]
combine_views vs [] = vs
combine_views [] vs = vs
combine_views vs (w:ws) = let (v', vs') = stack_view vs w in ...
  

stack_view :: [View] -> View -> (View, [View])
stack_view (v:vs) (View i, s,  = let c = get_content v in
  if  ...

get_content :: View -> (Maybe String) -> (Maybe Content)
get_content (View _ _ ns) id = get_content' ns id

get_content' :: [ViewNode] -> (Maybe String) -> (Maybe Content)
get_content' [] _ = None
get_content' n:ns id =
  let c = get_content'' n id in
    case c of
      None -> get_content' n id
      c' -> c'

get_content'' :: ViewNode -> (Maybe String) -> (Maybe Content)
get_content'' (DOMTextNode _ _) _ -> None
get_content'' (DOMElement _ _ _ ns) id -> get_content' ns id
get_content'' (ComponentElement _) id -> None
get_content'' c@(ContentElement None _) None -> c
get_content'' c@(ContentElement (Just i) _) (Just i) -> c
get_content'' (ContentElement _ _) _ -> None
get_content'' (TextElement _ _) _ -> None
