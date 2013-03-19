import Data.List;

data Component = Component
  Id (Maybe Component) [Link] [View] [Property] [Watch]

type Id = String

data Link = Link Uri Rel deriving Eq
type Uri = String
data Rel = Script | Stylesheet

instance Eq Rel where
  Script == Script = True
  Stylesheet == Stylesheet = True
  _ == _ = False

data View = View Id Stacking [ViewNode]
data Stacking = Top | Bottom | Replace

data ViewNode = DOMTextNode String
              | DOMElement Uri String [DOMAttribute] [ViewNode]
              | ComponentElement Component
              | ContentElement Id [ViewNode]
              | TextElement String String

data DOMAttribute = DOMAttribute String String String

data Property = Property String AnyValue
data AnyValue = AnyValue

instance Eq Property where
  (Property n _) == (Property m _) = n == m


data Watch = Watch [Get] [Set]
data Get = GetProperty Component String String
         | GetDOMEvent ViewNode String String
         | GetEvent Component String String
data Set = SetProperty Component String String
         | SetEvent String String
         | SetDOMAttribute ViewNode String String
         | SetDOMProperty ViewNode String String
         | SetAction ViewNode Action String
         | SetInsert ViewNode Position String
data Action = Append | Prepend | Remove
data Position = Before | After | Instead

data Event = Event Component String [AnyValue]

-- TODO Env has components/view nodes, and listeners are added directly on those
data Env = Env [Link] [Listener]

data Listener = PropertyListener Component String
              | DOMEventListener ViewNode String
              | EventListener Component String

show_id :: Component -> String
show_id (Component Nothing _ _ _ _ _) = "(anon)"
show_id (Component (Just id) _ _ _ _ _) = id

stack_views :: Component -> [Component]
stack_views c@(Component _ p _ vs _ _) =
  let v = view_for_id vs Nothing
      stack = case p of
                Nothing -> []
                Just p' -> stack_views p'
  in case v of
       Just (View _ Bottom _) -> c:stack
       Just (View _ Replace _) -> [c]
       otherwise -> stack ++ [c]
    
view_for_id :: [View] -> Id -> Maybe View
view_for_id [] _ = Nothing
view_for_id (v@(View i _ _):vs) j
  | i == j = Just v
  | otherwise = view_for_id vs j

render_stack :: [Component] -> ViewNode -> ViewNode
render_stack [] n -> n
render_stack [(Component _ _ _ vs _ _):cs] n =
  let v = view_for_id vs Nothing
  in case v of
       Nothing -> render_stack cs n
       Just (View _ _ ns) -> foldl (render_view_node cs) n ns

append_child :: ViewNode -> ViewNode -> ViewNode
append_child (DOMElement u n as ns) m -> (DOMElement u n as (ns ++ m))

render_view_node :: [Component] -> ViewNode -> ViewNode -> ViewNode
render_view_node _ n m@(DOMTextNode _) -> append_child n m
render_view_node cs n m@(DOMElement u n as ns) ->
  append_child n (DOMElement u n as (map (render_view_node cs 
