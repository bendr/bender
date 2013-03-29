# Bender extensions

## Very near future

### Property bindings

Property bindings are a syntactic extension to Bender allowing to easily bind a
text node or attribute with a property value.

For instance, the following:

```xml
<component xmlns="http://bender.igel.co.jp">
  <property name="width"/>
  <property name="height"/>
  <view xmlns:svg="http://www.w3.org/2000/svg">
    <svg:svg id="svg"/>
      ...
    </svg:svg>
  </view>
  <watch>
    <get property="x"/>
    <get property="y"/>
    <set view="svg">
      return "0 0 %0 %1".fmt(x, y);
    </set>
  </watch>
</component>
```

could be shortened to:

```xml
<component xmlns="http://bender.igel.co.jp">
  <property name="width"/>
  <property name="height"/>
  <view xmlns:svg="http://www.w3.org/2000/svg">
    <svg:svg viewBox="0 0 #width #height"/>
      ...
    </svg:svg>
  </view>
</component>
```

There should be a difference between a *lexical binding*, where the value is
simply inserted into a text string, and a *dynamic binding*, where the resulting
text string is also evaluated.
An example dynamic binding would be `$width * $height`, where the actual product
of the two values is the desired result.

### Element replication

Example (needs to be fleshed out):

```xml
<component xmlns="http://bender.igel.co.jp">
  <property name="n"/>
  <view>
    <component id="box.xml">
      <replicate count="#n">
        <attribute name="x"/>
      </replicate>
    </component>
  </view>
</component>
```

## Possible extensions

### Custom elements

Instead of:

```xml
<component xmlns="http://bender.igel.co.jp">
  <view>
    <component href="button.xml" enabled="true">
      <view>
        OK
      </view>
    </component>
  </view>
</component>
```

we have:

```xml
<component xmlns="http://bender.igel.co.jp">
  <view>
    <x:button enabled="true">OK</x:button>
  </view>
</component>
```

### Multiple views and content slots

A component could have multiple views wit different ids.
This would have two complementary purposes:

1. a view could be enabled or disabled in order to adapt the rendering of the
   component to different situations;

2. a view could also have multiple content slots with different ids.
   Upon rendering, the content slot would select the view from the component to
   be rendered on top that matches the id of the content.

### Inline get

Allowing the `get` element inside a view could lead to clearer markup.
For instance, the following:

```xml
<component xmlns="http://bender.igel.co.jp">
  <property name="x" value="42"/>
  <view>
    The value of x is <text id="show-x"/>.
  </view>
  <watch>
    <get property="x"/>
    <set view="show-x"/>
  </watch>
</component>
```

would be rewritten as:

```xml
<component xmlns="http://bender.igel.co.jp">
  <property name="x" value="42"/>
  <view>
    The value of x is <get property="x"/>
  </view>
</component>
```

### Getters and setters for properties

Transform the value of a property when it is accessed or set.

### Structured values in watches and properties

Watch inputs and outputs could contain structured content, so that the DOM of
the application could be manipulated more directly.

### Watch combinators

Enable/disable watches, in order to implement things like drag and drop.

### Watch conditionals

Activate watch inputs/outputs conditionally.
