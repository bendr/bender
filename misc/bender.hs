-- Bender operational semantics using Haskell

data Context = Context [Component]

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

data Watch = Watch [Get] [Set]
data Get = GetProperty Component String String
         | GetDOMEvent ViewNode String String
         | GetEvent Component String String
data Set = SetProperty Component String String
         | SetEvent String String
         | SetDOMAttribute ViewNode String String
         | SetDOMPoperty ViewNode String String
         | SetAction ViewNode Action String
         | SetInsert ViewNode Position String
data Action = Append | Prepend | Remove
data Position = Before | After | Instead

data Event = Event Component String [Anything]

data Anything = Anything


get_views :: Component -> [View]
get_views (Component _ None _ vs _ _ _) = vs
get_views (Component _ (Just k) _ vs _ _ _) = combine_views (get_views k) vs

combine_views :: [View] -> [View] -> [View]
combine_views vs [] = vs
combine_views [] ws = ws
combine_views (v:vs) ws@((View _ Bottom _):_) =
  let (v', ws') = stack_view v ws in v' : (combine_views vs ws')
combine_views (v:vs) (w:ws) =
  let (w', vs') = stack_view w vs in w' : (combine_views vs' ws)

stack_view :: View -> [View] -> (View, [View])
stack_view v@(View None _ _) w@(View None _ _):[] =
  (stack_single_view v w, [])

stack_single_view :: View -> View -> View
stack_single_view _ w@(View _ Replace _) = w
stack_single_view (View _ _ ns) (View i Top ns') =
  (View i Top (fill_content ns' ns))
stack_single_view (View _ _ ns) (View i Bottom ns') =
  (View i Bottom (fill_content ns ns'))

data ViewNode = DOMTextNode String
              | DOMElement String String [DOMAttribute] [ViewNode]
              | ComponentElement Component
              | ContentElement (Maybe String) [ViewNode]
              | TextElement String String

fill_content :: [ViewNode] -> [ViewNode] -> [ViewNode]
fill_content [] _ = []
fill_content (ComponentElement c):ns ms = ...
fill_content (ContentElement _ _):ns ms = ms ++ ns
fill_content n:ns ms = n : (fill_content n ms)

get_content :: View -> (Maybe String) -> (Maybe Content)
get_content (View _ _ ns) id = get_content' ns id

get_content' :: [ViewNode] -> (Maybe String) -> (Maybe Content)
get_content' [] _ = None
get_content' n:ns id =
  let c = get_content'' n id in
    case c of
      None -> get_content' n id
      otherwise -> c

get_content'' :: ViewNode -> (Maybe String) -> (Maybe Content)
get_content'' (DOMTextNode _ _) _ -> None
get_content'' (DOMElement _ _ _ ns) id -> get_content' ns id
get_content'' (ComponentElement _) id -> None
get_content'' c@(ContentElement None _) None -> c
get_content'' c@(ContentElement (Just i) _) (Just i) -> c
get_content'' (ContentElement _ _) _ -> None
get_content'' (TextElement _ _) _ -> None
