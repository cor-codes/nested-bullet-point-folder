# Nested Bullet Point Folder

This is a simple plugin for Obsidian (https://obsidian.md).

It allows you to automatically fold indentations for bullet points of a certain level. For instance:

```
- A
    - B
        - C
        - D
```

You can make it so that `C` and `D` are automatically folded into `B` when you open a file. Of course, you can still open `B` to see points `C` and `D`.

This may not work well with certain themes.

## Customizability

You can choose:
- What indentation level should be automatically hidden (folded into the one above)
- Whether or not indentation levels should be recursively folded (if opening `B` should also still keep the children of `C` or `D` folded, for example)
- What documents it should apply to (either no documents, all documents, or documents with a given tag.)

## Use-Case

Sometimes you want to write detailed notes, but you don't want to read in the fullest detail. Using this plugin can allow you to choose when to unfold a point to see specific detail, making a surface read far faster.

## Warning

This is my first ever Obsidian plugin. It should be safe to use but I wouldn't recommend using it on important vaults.