import Data.List;

data Component = Component
  (Maybe Id) (Maybe Component) [Link] [View] [Property] [Watch]

type Id = String

data Link = Link Uri Rel deriving Eq
type Uri = String
data Rel = Script | Stylesheet

instance Eq Rel where
  Script == Script = True
  Stylesheet == Stylesheet = True
  _ == _ = False

data View = View (Maybe Id) Stacking [ViewNode]
data Stacking = Top | Bottom | Replace

data ViewNode = DOMTextNode String
              | DOMElement Uri String [DOMAttribute] [ViewNode]
              | ComponentElement Component
              | ContentElement (Maybe String) [ViewNode]
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
         | SetDOMPoperty ViewNode String String
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

render_component :: Component -> ViewNode -> Env -> (ViewNode, Env)
render_component c n e =
  let e' = render_links c e
      (e'', n') = render_views c e' n
  in render_watches c n' e''


-- A link must be rendered only once in the same environment
render_links :: Component -> Env -> Env
render_links (Component _ _ ls _ _ _) e = foldl render_link e ls

render_link :: Env -> Link -> Env
render_link e@(Env ls _) l@(Link u r)
  | elem l ls = e
  | otherwise = case r of Script -> render_script e l
                          Stylesheet -> render_stylesheet e l

-- Rendering scripts is implementation dependent
render_script :: Env -> Link -> Env
render_script (Env ls hs) l = Env (l:ls) hs

-- Rendering stylesheets is implementation dependent
render_stylesheet :: Env -> Link -> Env
render_stylesheet (Env ls hs) l = Env (l:ls) hs


-- Render the views of the component in the target node
render_views :: Component -> Env -> ViewNode -> ViewNode
render_views (Component _ k _ vs _ _ _) (DOMElement u n a cs) =
  let rs = map render_node (get_views k vs)
  in DOMElement u n a (cs ++ rs)

render_node :: ViewNode -> ViewNode
render_node (DOMTextNode s) = DOMTextNode s
render_node (DOMElement u n as vs) =
  DOMElement u n (filter (\a -> not (is_id a)) as) (map render_node vs)
render_node (ComponentElement c) = render_component

data ViewNode = DOMTextNode String
              | DOMElement Uri String [DOMAttribute] [ViewNode]
              | ComponentElement Component
              | ContentElement (Maybe String) [ViewNode]
              | TextElement String String

get_views :: Maybe Component -> [View] -> [View]
get_views Nothing ws = ws
get_views (Just (Component _ k _ vs _ _ _)) ws =
  combine_views (get_views k vs) ws

-- Combine prototype views with component views
combine_views :: [View] -> [View] -> [View]
combine_views [] ws = ws
--combine_views vs (w@(View i Top ns):ws) = 
